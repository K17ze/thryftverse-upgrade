'use client';

/**
 * HostLiveRoom — the on-air console: the cover as the simulated stage,
 * LIVE pill + viewer count + elapsed clock chrome, the pinned-product
 * command rail, and the moderation chat. Presence, pin clicks and orders
 * tick on seeded intervals — deterministic per session, labelled demo.
 * Ending hands the collected (simulated) metrics to the summary phase.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LiveBadge } from '@/components/live/LiveBadge';
import { seededRandom } from '@/components/live/useLivePresence';
import { formatCount } from '@/lib/utils/format';
import { HostChatPanel } from './HostChatPanel';
import { HostPinnedRail } from './HostPinnedRail';
import { formatClock, MAX_PINS, seedBaseViewers, type HostStream, type HostSummaryStats } from './hostStreams';

const TICK_MS = 3_800;

interface HostLiveRoomProps {
  stream: HostStream;
  /** Active own listings — the pool the pinned rail adds/removes from. */
  candidates: Listing[];
  onPinsChange: (pinIds: string[]) => void;
  onEnd: (stats: HostSummaryStats) => void;
}

const mediaPill =
  'tnum inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary';

export function HostLiveRoom({ stream, candidates, onPinsChange, onEnd }: HostLiveRoomProps) {
  const id = stream.session.id;
  const base = stream.session.viewers ?? seedBaseViewers(id);

  const [viewers, setViewers] = useState(base);
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - (stream.startedAtMs ?? Date.now())) / 1000)),
  );
  const [ending, setEnding] = useState(false);
  const statsRef = useRef<HostSummaryStats>({ peakViewers: base, pinClicks: 0, orders: 0 });

  // Elapsed clock — mirrors mobile's liveSeconds chrome line.
  useEffect(() => {
    const started = stream.startedAtMs ?? Date.now();
    const iv = window.setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))),
      1_000,
    );
    return () => window.clearInterval(iv);
  }, [stream.startedAtMs]);

  // Presence + engagement ticks — seeded streams, deterministic per show.
  useEffect(() => {
    const vrand = seededRandom(`${id}:viewers`);
    const crand = seededRandom(`${id}:commerce`);
    const iv = window.setInterval(() => {
      setViewers((v) => {
        const drift = Math.round((vrand() * 2 - 1) * Math.max(3, base * 0.05));
        const next = Math.max(
          Math.round(base * 0.7),
          Math.min(Math.round(base * 1.6), v + drift),
        );
        statsRef.current.peakViewers = Math.max(statsRef.current.peakViewers, next);
        return next;
      });
      if (crand() < 0.6) statsRef.current.pinClicks += 1 + Math.floor(crand() * 3);
      if (crand() < 0.14) statsRef.current.orders += 1;
    }, TICK_MS);
    return () => window.clearInterval(iv);
  }, [id, base]);

  const end = () => {
    if (ending) return;
    setEnding(true);
    window.setTimeout(() => onEnd({ ...statsRef.current }), 600);
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-4 sm:px-6">
      {/* Console chrome — exit left, end right (mobile grammar). */}
      <div className="flex items-center gap-2">
        <Link
          href="/live"
          aria-label="Back to live hub — the show keeps running"
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="clamp-1 min-w-0 flex-1 text-section-title font-semibold text-text-primary">
          {stream.session.title}
        </h1>
        <Button variant="danger" size="sm" onClick={end} disabled={ending}>
          {ending ? 'Ending…' : 'End stream'}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* Stage — the show cover stands in for a feed; caption says so. */}
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-surface-alt">
            <AppImage
              src={stream.session.coverUri}
              alt={stream.session.title}
              fill
              priority
              className="h-full w-full"
              sizes="(max-width: 1024px) 100vw, 800px"
            />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
              <div className="flex items-center gap-1.5">
                <LiveBadge />
                <span className={`${mediaPill} uppercase tracking-[0.08em]`}>Demo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={mediaPill} aria-label="Simulated viewers">
                  <Icon name="eye" size={12} />
                  {formatCount(viewers)}
                </span>
                <span className={mediaPill} aria-label="Elapsed time">
                  <Icon name="clock" size={12} />
                  {formatClock(elapsed)}
                </span>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-14">
              <p className="clamp-1 text-body-emphasis font-semibold text-scrim-text-primary">
                {stream.session.title}
              </p>
            </div>
          </div>
          <p className="mt-2 text-meta text-text-muted">
            Simulated stage — viewers, chat and orders are generated locally; no video is broadcast in demo mode.
          </p>

          <div className="mt-6">
            <HostPinnedRail
              pinIds={stream.pinIds}
              candidates={candidates}
              max={MAX_PINS}
              onChange={onPinsChange}
            />
          </div>
        </div>

        <aside className="flex w-full flex-col border-t border-border-subtle pt-5 lg:w-[340px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <HostChatPanel sessionId={id} active />
        </aside>
      </div>
    </div>
  );
}
